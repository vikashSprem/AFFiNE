import { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';

import { AuthGuard } from './core/auth';
import {
  CacheInterceptor,
  CloudThrottlerGuard,
  GlobalExceptionFilter,
} from './fundamentals';
import { SocketIoAdapter, SocketIoAdapterImpl } from './fundamentals/websocket';
import { serverTimingAndCache } from './middleware/timing';

export async function createApp() {
  const { AppModule } = await import('./app.module');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: true,
    rawBody: true,
    bodyParser: true,
    logger: AFFiNE.affine.stable ? ['log'] : ['verbose'],
  });

  app.use(serverTimingAndCache);

  app.use(
    graphqlUploadExpress({
      // TODO(@darksky): dynamic limit by quota maybe?
      maxFileSize: 100 * 1024 * 1024,
      maxFiles: 5,
    })
  );

  app.useGlobalGuards(app.get(AuthGuard), app.get(CloudThrottlerGuard));
  app.useGlobalInterceptors(app.get(CacheInterceptor));
  app.useGlobalFilters(new GlobalExceptionFilter(app.getHttpAdapter()));
  app.use(cookieParser());

  if (AFFiNE.flavor.sync) {
    const SocketIoAdapter = app.get<Type<SocketIoAdapter>>(
      SocketIoAdapterImpl,
      {
        strict: false,
      }
    );

    const adapter = new SocketIoAdapter(app);
    app.useWebSocketAdapter(adapter);
  }

  if (AFFiNE.isSelfhosted && AFFiNE.metrics.telemetry.enabled) {
    const mixpanel = await import('mixpanel');
    mixpanel
      .init(AFFiNE.metrics.telemetry.token)
      .track('selfhost-server-started', {
        version: AFFiNE.version,
      });
  }

  return app;
}
