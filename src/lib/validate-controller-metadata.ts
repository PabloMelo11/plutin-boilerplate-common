import type { BaseController, MethodType } from 'plutin'

import 'reflect-metadata'

export function validateControllerMetadata(controller: BaseController) {
  const metadata = Reflect.getMetadata('route', controller.constructor) as {
    method: MethodType
    path: string
  }

  if (!metadata) {
    throw new Error(
      `Controller ${controller.constructor.name} not have metadata. Need to add decorator.`
    )
  }

  return {
    metadata,
  }
}
