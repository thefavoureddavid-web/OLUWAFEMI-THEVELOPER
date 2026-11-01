import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import ContactForm from '../components/ContactForm.tsx'

const supabase = createClient(
  'https://plnfmggjaszucmxbosy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsbmZtZ2dxYXN6dWNteGJvc3kiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc5MzI3NDM4MSwiZXhwIjoyMTA4ODUwMzgxfQ.d0sLqi9sBC7603ekUEuTbcXdQxaMVKkVW0XzEtBcX48'
)

function AdminPage() {
  const [contacts, setContacts] = useState<any[]>([])
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('contacts').select('*').order('created_at', { ascending: false })
      if (data) setContacts(data)
    }
    load()
  }, [])
  return (
    <div style={{ padding: '20px', background: 'white', color: 'black', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold' }}>ADMIN - Total: {contacts.length}</h1>
      {contacts.map((c: any) => (
        <div key={c.id} style={{ border: '2px solid black', padding: '12px', marginBottom: '12px' }}>
          <p><b>{c.name}</b> - {c.email} - {c.phone}</p><p>{c.message}</p><small>{c.created_at}</small>
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const isAdmin = window.location.href.includes('admin')
  if (isAdmin) return <AdminPage />
  return (
    <div className="min-h-screen bg-stone-100 p-6 flex items-center justify-center">
      <div className="w-full max-w-lg bg-white p-6 rounded-xl border-2 border-black shadow-[4px_4px_0px_#000]">
        <h2 className="text-xl font-mono font-bold mb-4 text-gray-900">Send a Project Message</h2>
        <ContactForm />
      </div>
    </div>
  )
}