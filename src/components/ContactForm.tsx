import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

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
    try {
      // 1. SAVE TO SUPABASE FIRST - This must be before WhatsApp
      const { error } = await supabase
        .from('messages')
        .insert([{ name, email, message, phone }]);

      if (error) {
        console.error('Supabase error:', error);
        alert('Supabase error: ' + error.message);
        setLoading(false);
        return;
      }

      setToastMsg('Saved! Opening WhatsApp...');

      // 2. THEN OPEN WHATSAPP AFTER Supabase succeeds
      const waText = encodeURIComponent(
        `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nMessage: ${message}`
      );
      window.open(`https://wa.me/2349115742760?text=${waText}`, '_blank');

      // Clear form
      setFormData({ name: '', email: '', phone: '', message: '' });
      
      setTimeout(() => setToastMsg(null), 3000);
    } catch (err: any) {
      alert('Failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Keep all your JSX inputs for name, email, phone, message here - same as before */}
      <div>
        <label className="block text-xs font-mono font-bold mb-1">Phone</label>
        <input
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          className="w-full px-3 py-2 border rounded"
        />
      </div>
      <div>
        <label className="block text-xs font-mono font-bold mb-1">Message</label>
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
        {loading ? 'Saving to Supabase...' : 'Submit & Open WhatsApp'}
      </button>
      {toastMsg && <p className="mt-2 text-sm text-green-600">{toastMsg}</p>}
    </form>
  );
};

export default ContactForm;