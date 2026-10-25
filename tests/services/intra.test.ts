import { expect, test } from 'vitest'
import { createIntraService } from '../../src/main/services/intra'

test('intra : null sans réseau', async () => {
  const svc = createIntraService()
  expect(svc.id).toBe('intra')
  expect(await svc.refresh()).toBeNull()
})
