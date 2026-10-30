import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', message: '', phone: '' })
  const [status, setStatus] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('Sending...')

    // THIS WILL SHOW THE REAL ERROR
    const { data, error } = await supabase
      .from('messages')
      .insert([{ 
        name: form.name, 
        email: form.email, 
        message: form.message, 
        phone: form.phone,
        project_type: 'general',
        budget_range: 'any'
      }])
      .select()

    if (error) {
      alert('REAL ERROR: ' + error.message + '\n\nDetails: ' + JSON.stringify(error))
      setStatus('Failed: ' + error.message)
      console.log('SUPABASE ERROR:', error)
      return
    }

    alert('SUCCESS! Saved: ' + JSON.stringify(data))
    setStatus('Sent successfully!')
    setForm({ name: '', email: '', message: '', phone: '' })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input placeholder="Name" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} required />
      <input placeholder="Email" type="email" value={form.email} onChange={e=>setForm({...form, email:e.target.value})} required />
      <input placeholder="Phone" value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})} />
      <textarea placeholder="Message" value={form.message} onChange={e=>setForm({...form, message:e.target.value})} required />
      <button type="submit">{status || 'Send Message'}</button>
      <p>{status}</p>
    </form>
  )
}