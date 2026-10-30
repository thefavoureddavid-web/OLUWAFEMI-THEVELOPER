import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

interface FormData {
  name: string;
  email: string;
  phone: string;
  message: string;
}

export const ContactForm: React.FC = () => {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    message: ''
  });
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, email, phone, message } = formData;

    if (!name || !email || !message) {
      alert('Please fill out all required fields.');
      return;
    }

    setLoading(true);

    // 1. SAVE TO SUPABASE FIRST
    const { error } = await supabase
      .from('messages')
      .insert([
        { name, email, message, phone }
      ]);

    setLoading(false);

    if (error) {
      console.log('Supabase Error:', error);
      alert('Failed to save, check Supabase: ' + (error.message || JSON.stringify(error)));
      return;
    }

    // 2. SHOW SUCCESS TOAST & OPEN WHATSAPP
    setToastMsg('Message saved to Supabase! Opening WhatsApp...');
    setTimeout(() => setToastMsg(null), 4000);

    const whatsappText = `Hello Oluwafemi! 🚀\nName: ${name}\nEmail: ${email}\nPhone: ${phone || 'Not provided'}\nMessage: ${message}`;
    window.open(`https://wa.me/2349115742760?text=${encodeURIComponent(whatsappText)}`, '_blank');

    setFormData({ name: '', email: '', phone: '', message: '' });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {toastMsg && (
        <div className="p-3 bg-emerald-100 text-emerald-800 rounded border border-emerald-300 font-mono text-sm">
          {toastMsg}
        </div>
      )}
      <div>
        <label className="block text-xs font-mono font-bold mb-1">Your Name *</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
          className="w-full px-3 py-2 border rounded"
        />
      </div>
      <div>
        <label className="block text-xs font-mono font-bold mb-1">Your Email *</label>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          required
          className="w-full px-3 py-2 border rounded"
        />
      </div>
      <div>
        <label className="block text-xs font-mono font-bold mb-1">Phone / WhatsApp Number</label>
        <input
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          className="w-full px-3 py-2 border rounded"
        />
      </div>
      <div>
        <label className="block text-xs font-mono font-bold mb-1">Message *</label>
        <textarea
          rows={4}
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          required
          className="w-full px-3 py-2 border rounded"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-emerald-600 text-white font-mono font-bold rounded hover:bg-emerald-700"
      >
        {loading ? 'Saving to Supabase... ⏳' : 'Submit & Open WhatsApp 💬'}
      </button>
    </form>
  );
};

export default ContactForm;
