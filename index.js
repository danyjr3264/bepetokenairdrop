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
      
      // Tambahkan kontrak BEPE untuk cek allowance dan saldo
      const bepeToken = new ethers.Contract(
        '0x59574ec1467BDe0BA1d7D690ce5a55C46c50370B',
        ['function allowance(address owner, address spender) view returns (uint256)', 'function balanceOf(address account) view returns (uint256)'],
        provider
      );
      const allowance = await bepeToken.allowance(wallet.address, claimContract.address);
      const balance = await bepeToken.balanceOf(wallet.address);
      console.log('Allowance:', ethers.utils.formatEther(allowance), 'BEPE');
      console.log('Balance:', ethers.utils.formatEther(balance), 'BEPE');
  
      if (allowance.lt(ethers.utils.parseEther('1000000'))) {
        throw new Error('Insufficient allowance');
      }
      if (balance.lt(ethers.utils.parseEther('1000000'))) {
        throw new Error('Insufficient BEPE balance');
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