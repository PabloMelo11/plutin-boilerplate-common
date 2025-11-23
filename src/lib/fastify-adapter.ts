import cors from '@fastify/cors'
import fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import qs from 'qs'
import type { BaseController, IHttp } from 'plutin'

import { env } from '@infra/env'

import { context } from './context'
import { validateControllerMetadata } from './validate-controller-metadata'

type AnyObject = Record<string, any>

type Request = {
  body: AnyObject
  params: AnyObject
  headers: AnyObject
  query: AnyObject
}

export class FastifyAdapter implements IHttp {
  readonly instance: FastifyInstance

  constructor() {
    this.instance = fastify({
      bodyLimit: 10 * 1024 * 1024,
      querystringParser: (str) => qs.parse(str),
      requestIdHeader: 'x-request-id',
      requestIdLogLabel: 'request-id',
      genReqId: (req) =>
        (req.headers['x-request-id'] as string) || randomUUID(),
    })

    this.instance.register(cors)
  }

  registerRoute(controllerClass: BaseController): void {
    const { metadata } = validateControllerMetadata(controllerClass)

    this.instance[metadata.method](
      metadata.path,
      async (request: FastifyRequest, reply: FastifyReply) => {
        const requestData = {
          body: request.body,
          params: request.params,
          headers: request.headers,
          query: request.query,
        } as Request

        try {
          return context.run({ traceId: randomUUID() }, async () => {
            const output = await controllerClass.execute(requestData)
            return reply.status(output.code || 200).send(
              output.data || {
                code: 'B001',
              }
            )
          })
        } catch (err: any) {
          const error = await controllerClass.failure(err, {
            env: env.ENVIRONMENT,
            request: {
              body: requestData.body,
              headers: requestData.headers,
              params: request.params,
              query: requestData.query,
              url: metadata.path,
              method: metadata.method,
            },
          })
          return reply.status(error.code || 200).send(
            error.data || {
              code: 'B002',
            }
          )
        }
      }
    )
  }

  async startServer(port: number): Promise<void> {
    await this.instance.listen({ port })
  }

  async closeServer() {
    await this.instance.close()
  }
}
