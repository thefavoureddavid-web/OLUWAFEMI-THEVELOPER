import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://plnfmggjaszucmxbosy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsbmZtZ3FqYXNwenVjb214YnN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNzQzODEsImV4cCI6MjEwODg1MDM4MX0.d0sLqi9sBC7603ekUEuTbcXdQxaMVKkVW0XzEtBcX48'
)

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
    } else {
      alert('SUCCESS! Check Supabase Row 3')
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