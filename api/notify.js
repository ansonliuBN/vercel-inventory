// 負責：發送 Email
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    const { subject, content } = req.body;
    await resend.emails.send({
        from: 'system@yourdomain.com',
        to: 'boss@yourdomain.com',
        subject: subject,
        html: content
    });
    return res.json({ sent: true });
}