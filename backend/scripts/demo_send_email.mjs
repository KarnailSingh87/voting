import nodemailer from 'nodemailer';

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

(async () => {
  try {
    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });

    const otp = generateOTP();
    const info = await transporter.sendMail({
      from: `Demo OTP <${testAccount.user}>`,
      to: 'test@example.com',
      subject: 'Demo Voting OTP',
      text: `Your demo OTP is: ${otp}. Valid for 5 minutes.`,
    });

    console.log('Demo OTP sent. OTP:', otp);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) console.log('Ethereal preview URL:', previewUrl);
    else console.log('No preview URL available.');
  } catch (err) {
    console.error('Demo send failed:', err);
    process.exit(1);
  }
})();
