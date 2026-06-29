import nodemailer from 'nodemailer';

const GMAIL_USER = 'srfpapis@gmail.com';
const GMAIL_APP_PASSWORD = 'znflqiuqoerlambv';
const EMAIL_FROM = 'srfpapis@gmail.com';
const TEST_TO = 'srfpapis@gmail.com';

console.log('=== Gmail Service Diagnostic Test ===');
console.log('User:', GMAIL_USER);
console.log('App Password:', `${GMAIL_APP_PASSWORD.slice(0,4)}...${GMAIL_APP_PASSWORD.slice(-4)} (${GMAIL_APP_PASSWORD.length} chars)`);
console.log('');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  }
});


try {
  await transporter.verify();
  console.log('✅ SMTP connection and authentication SUCCESSFUL!');

  console.log('\nSending test email...');
  const info = await transporter.sendMail({
    from: `"SRF Test" <${EMAIL_FROM}>`,
    to: TEST_TO,
    subject: 'SRF SMTP Diagnostic Test',
    text: 'This is a test email from the SRF platform SMTP diagnostic script.',
    html: '<p>This is a test email from the <strong>SRF platform</strong> SMTP diagnostic script.</p>'
  });
  console.log('✅ Test email sent! Message ID:', info.messageId);
} catch (err) {
  console.error('❌ SMTP Error Code:', err.code);
  console.error('   Response:', err.response || err.message);

  if (err.code === 'EAUTH' || (err.response && err.response.includes('535'))) {
    console.log('\n━━━ DIAGNOSIS: AUTHENTICATION FAILED ━━━');
    console.log('The App Password "vujukigoktzvcfzs" is INVALID or REVOKED by Google.');
    console.log('\nTo fix:');
    console.log('1. Go to https://myaccount.google.com/apppasswords');
    console.log('2. Delete the old password');
    console.log('3. Create a NEW 16-char app password');
    console.log('4. Update SMTP_PASS in backend/.env with the new code (no spaces)');
  } else if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
    console.log('\n━━━ DIAGNOSIS: NETWORK BLOCKED ━━━');
    console.log('Cannot reach smtp.gmail.com:587. Your ISP/firewall is blocking SMTP.');
  }
}
