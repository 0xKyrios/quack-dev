import { createFileRoute } from '@tanstack/react-router'

import { createRealtimeSession } from '../../lib/openai.server'
import type { ChargeSheet } from '../../lib/types'

export const Route = createFileRoute('/api/realtime-session')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const chargeSheet = body?.chargeSheet as ChargeSheet

          if (!chargeSheet?.case_title) {
            throw new Error('Missing review summary.')
          }

          return Response.json(await createRealtimeSession(chargeSheet))
        } catch (error) {
          return Response.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Realtime voice is unavailable. Use the typed fallback.',
            },
            { status: 400 },
          )
        }
      },
    },
  },
})
