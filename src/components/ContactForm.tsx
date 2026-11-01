///import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://plnfmggjaszucmxbosy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsbmZtZ2dxYXN6dWNteGJvc3kiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc5MzI3NDM4MSwiZXhwIjoyMTA4ODUwMzgxfQ.d0sLqi9sBC7603ekUEuTbcXdQxaMVKkVW0XzEtBcX48'
)

export default function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' })
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    const { error } = await supabase.from('contacts').insert([form])
    if (!error) {
      setSent(true)
      setForm({ name: '', email: '', phone: '', message: '' })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input className="border-2 border-black p-2" placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
      <input className="border-2 border-black p-2" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
      <input className="border-2 border-black p-2" placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
      <textarea className="border-2 border-black p-2" placeholder="Message" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} required />
      <button type="submit" className="bg-black text-white p-2 font-bold">Send Message</button>
      {sent && <p className="text-green-600 font-bold">Message Sent! Check /admin</p>}
    </form>
  )
}