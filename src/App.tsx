import ContactForm from './components/ContactForm.tsx'

export default function App() {
  return (
    <div className="min-h-screen bg-stone-100 p-6 flex items-center justify-center">
      <div className="w-full max-w-lg bg-white p-6 rounded-xl border-2 border-black shadow-[4px_4px_0px_#000]">
        <h2 className="text-xl font-mono font-bold mb-4 text-gray-900">Send a Project Message</h2>
        <ContactForm />
      </div>
    </div>
  )
}