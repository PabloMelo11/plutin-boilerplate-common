import { BaseController, Controller, Response } from 'plutin'

@Controller({
  method: 'get',
  path: 'health',
})
export default class HealthController extends BaseController {
  constructor() {
    super()
  }

  async handle(): Promise<Response> {
    return this.success({
      ok: true,
    })
  }
}
