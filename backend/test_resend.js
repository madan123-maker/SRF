import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

async function testEmail() {
    try {
        console.log('API Key First 10 chars:', process.env.RESEND_API_KEY.substring(0, 10));
        console.log('Sending test email to an unverified email (should throw testing sandbox error)...');
        const { data, error } = await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: ['fake_developer_test@example.com'],
            subject: 'Hello World',
            text: 'Testing',
        });

        if (error) {
            console.log('API REJECTED (Expected):', error.message);
        } else {
            console.log('API Succeeded unexpectedly?', data);
        }

    } catch (e) {
        console.log('FATAL ERROR:', e.message);
    }
}
testEmail();
