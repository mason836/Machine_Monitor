import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { type, machine } = req.body

  if (!type || !['start', 'stop'].includes(type)) {
    return res.status(400).json({ error: 'type must be start or stop' })
  }

  const { error } = await supabase.from('events').insert({
    type,
    machine: machine || 'line-2-case-packer'
  })

  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ ok: true, type })
}
