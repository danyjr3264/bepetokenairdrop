const express = require('express');
const ethers = require('ethers');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Konfigurasi Base dan kontrak
const provider = new ethers.providers.JsonRpcProvider('https://mainnet.base.org');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '', provider);
const claimContract = new ethers.Contract(
  '0xF66669aE4c0e89F28B630Fe7DC84dAcAd1FB5c10',
  [
    'function claim(uint256 fid, address recipient) external',
    'function hasClaimed(uint256 fid) view returns (bool)'
  ],
  wallet
);

// Gambar untuk Frame
const initialImage = 'https://blush-hidden-mongoose-258.mypinata.cloud/ipfs/bafkreihh3z4zd3ksow5vfgye3e3tt2oxqpuqvwcsdlvbxtlejf4abeq5ra';
const successImage = 'https://blush-hidden-mongoose-258.mypinata.cloud/ipfs/bafkreie6aufatogglaniin6lgbsrykpb5xts2uu5avve2vofymvns5yqii';
const alreadyClaimedImage = 'https://blush-hidden-mongoose-258.mypinata.cloud/ipfs/bafkreigbqnrr2yxpllo65yw5obwctcypklmnbt7v6iryv67odloqil6mvu';

// Konfigurasi Neynar
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '';
const YOUR_FID = 1041332;

// Fungsi untuk memverifikasi follow dengan Neynar
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

// Rute root
app.get('/', (req, res) => {
  res.redirect('/frame');
});

// Tampilan awal Frame
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

// Proses klaim
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
    const tx = await claimContract.claim(fid, recipient, { gasLimit: 200000 }); // Tambahkan gas limit manual
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