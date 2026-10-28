import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { appOptions, setupApp } from './setup-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, appOptions);
  setupApp(app);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`API running on http://localhost:${port} (docs: /api/docs)`, 'Bootstrap');
}

bootstrap();
