import { useState } from 'react'
import { supabase } from './supabaseClient'
// If this gives error, try: '../lib/supabaseClient' or './lib/supabaseClient'

export default function ContactForm() {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', project_type: '', budget_range: '', message: '' })

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.from('contacts').insert([form])
    setLoading(false)
    if (error) {
      alert('FAILED: ' + error.message)
      console.log(error)
    } else {
      alert('SUCCESS! Now check Supabase - Row 3 should appear')
      setForm({ name: '', email: '', phone: '', project_type: '', budget_range: '', message: '' })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input required placeholder="Name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full p-3 border rounded" />
      <input required placeholder="Email" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="w-full p-3 border rounded" />
      <input placeholder="Phone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className="w-full p-3 border rounded" />
      <input placeholder="Project Type" value={form.project_type} onChange={e=>setForm({...form,project_type:e.target.value})} className="w-full p-3 border rounded" />
      <input placeholder="Budget" value={form.budget_range} onChange={e=>setForm({...form,budget_range:e.target.value})} className="w-full p-3 border rounded" />
      <textarea required placeholder="Message" value={form.message} onChange={e=>setForm({...form,message:e.target.value})} className="w-full p-3 border rounded" />
      <button disabled={loading} type="submit" className="w-full bg-black text-white p-3 rounded">{loading?'Sending...':'Send Message'}</button>
    </form>
  )
}