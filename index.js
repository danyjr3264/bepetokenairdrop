const express = require('express');
const ethers = require('ethers');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const provider = new ethers.providers.JsonRpcProvider('https://mainnet.base.org');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '', provider);
const claimContract = new ethers.Contract(
  '0xF66669aE4c0e89F28B630Fe7DC84dAcAd1FB5c10',
  [
    'function claim(uint256 fid, address recipient) external',
    'function hasClaimed(uint256 fid) view returns (bool)',
    'function owner() view returns (address)',
    'function bepeToken() view returns (address)'
  ],
  wallet
);

const bepeToken = new ethers.Contract(
  '0x59574ec1467BDe0BA1d7D690ce5a55C46c50370B',
  [
    'function allowance(address owner, address spender) view returns (uint256)',
    'function balanceOf(address account) view returns (uint256)',
    'function transferFrom(address sender, address recipient, uint256 amount) external returns (bool)'
  ],
  wallet
);

const initialImage = 'https://blush-hidden-mongoose-258.mypinata.cloud/ipfs/bafkreihh3z4zd3ksow5vfgye3e3tt2oxqpuqvwcsdlvbxtlejf4abeq5ra';
const successImage = 'https://blush-hidden-mongoose-258.mypinata.cloud/ipfs/bafkreie6aufatogglaniin6lgbsrykpb5xts2uu5avve2vofymvns5yqii';
const alreadyClaimedImage = 'https://blush-hidden-mongoose-258.mypinata.cloud/ipfs/bafkreigbqnrr2yxpllo65yw5obwctcypklmnbt7v6iryv67odloqil6mvu';

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '';
const YOUR_FID = 1041332;

async function checkFollow(fid) {
  try {
    console.log('Checking follow for FID:', fid);
    const followsResponse = await axios.get(
      `https://api.neynar.com/v2/farcaster/following?fid=${fid}`,
      {
        headers: { 'api_key': NEYNAR_API_KEY }
      }
    );
    console.log('Neynar API response:', followsResponse.data);
    if (!followsResponse.data.users || !Array.isArray(followsResponse.data.users)) {
      console.error('No users data in response or not an array');
      return false;
    }
    return followsResponse.data.users.some(f => f.user.fid === YOUR_FID);
  } catch (e) {
    console.error('Error checking follow:', e.message, e.response?.data);
    return false;
  }
}

app.get('/', (req, res) => {
  res.redirect('/frame');
});

app.get('/frame', (req, res) => {
  console.log('Frame accessed');
  res.set('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta property="fc:frame" content="vNext" />
        <meta property="fc:frame:image" content="${initialImage}" />
        <meta property="fc:frame:input:text" content="Enter your wallet address" />
        <meta property="fc:frame:button:1" content="Claim $BEPE" />
        <meta property="fc:frame:button:1:action" content="post" />
        <meta property="fc:frame:post_url" content="${req.protocol}://${req.get('host')}/claim" />
      </head>
      <body></body>
    </html>
  `);
});

app.post('/claim', async (req, res) => {
  console.log('Claim attempt:', req.body);
  const { untrustedData } = req.body;
  const fid = untrustedData?.fid;
  const recipient = untrustedData?.inputText;

  if (!fid || !recipient) {
    return res.send('Error: FID or wallet address missing');
  }

  if (!ethers.utils.isAddress(recipient)) {
    return res.send('Error: Invalid wallet address');
  }

  const hasClaimed = await claimContract.hasClaimed(fid);
  console.log('Has claimed:', hasClaimed);
  if (hasClaimed) {
    return res.set('Content-Type', 'text/html').send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta property="fc:frame" content="vNext" />
          <meta property="fc:frame:image" content="${alreadyClaimedImage}" />
          <meta property="fc:frame:button:1" content="Your FID has been claimed" />
        </head>
        <body></body>
      </html>
    `);
  }

  const isFollowing = await checkFollow(fid);
  console.log('Is following:', isFollowing);
  if (!isFollowing) {
    return res.set('Content-Type', 'text/html').send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta property="fc:frame" content="vNext" />
          <meta property="fc:frame:image" content="${initialImage}" />
          <meta property="fc:frame:button:1" content="Follow me to claim!" />
        </head>
        <body></body>
      </html>
    `);
  }

  try {
    console.log('Attempting claim with FID:', fid, 'Recipient:', recipient);

    const owner = await claimContract.owner();
    const tokenAddress = await claimContract.bepeToken();
    console.log('Contract owner:', owner);
    console.log('BEPE token address in contract:', tokenAddress);

    const allowance = await bepeToken.allowance(owner, claimContract.address);
    const balance = await bepeToken.balanceOf(owner);
    console.log('Allowance:', ethers.utils.formatEther(allowance), 'BEPE');
    console.log('Balance:', ethers.utils.formatEther(balance), 'BEPE');

    if (allowance.lt(ethers.utils.parseEther('1000000'))) {
      throw new Error('Insufficient allowance');
    }
    if (balance.lt(ethers.utils.parseEther('1000000'))) {
      throw new Error('Insufficient BEPE balance');
    }

    // Cek estimasi gas untuk mendeteksi revert
    try {
      const gasEstimate = await claimContract.estimateGas.claim(fid, recipient);
      console.log('Gas estimate for claim:', gasEstimate.toString());
    } catch (gasError) {
      console.error('Gas estimation failed:', gasError.message, gasError);
      throw new Error('Gas estimation failed: ' + gasError.message);
    }

    const tx = await claimContract.claim(fid, recipient, { gasLimit: 200000 });
    console.log('Transaction sent:', tx.hash);
    await tx.wait();
    console.log('Transaction confirmed');
    res.set('Content-Type', 'text/html').send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta property="fc:frame" content="vNext" />
          <meta property="fc:frame:image" content="${successImage}" />
          <meta property="fc:frame:button:1" content="Congratulations" />
        </head>
        <body></body>
      </html>
    `);
  } catch (e) {
    console.error('Claim error:', e.message, e);
    res.send('Error: Claim failed - ' + e.message);
  }
});

module.exports = app;