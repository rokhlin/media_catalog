import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe, Logger } from '@nestjs/common';
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { AppModule } from './app.module.js';
import { AppConfigService } from './config/config.service.js';
import { LogBufferService } from './logging/log-buffer.service.js';
import { AllExceptionsFilter } from './logging/all-exceptions.filter.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(AppConfigService);
  const logBuffer = app.get(LogBufferService, { strict: false });
  const port = configService.port;

  // Register global error interception with detailed pipeline logging
  app.useGlobalFilters(new AllExceptionsFilter(logBuffer));

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Enable CORS for mobile apps & web clients
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Swagger OpenAPI Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Media Library API')
    .setDescription('REST API for Media Library, Face Registry, and Cataloger Pipeline (Ready for Web & Mobile Clients)')
    .setVersion('1.0.0')
    .addTag('media', 'Media files, metadata, sidecar, and manual person tagging')
    .addTag('faces', 'Face recognition registry, person identities, and clusters')
    .addTag('settings', 'System folders, storage configuration, and native pickers')
    .addTag('pipeline', 'Cataloging synchronization and AI analysis execution')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // Ensure data/feature_flags.json exists from default-feature-flags.json if missing
  configService.ensureFeatureFlagsFile();

  // Serve static files from /data if directory exists (e.g. data/feature_flags.json)
  const dataDir = path.resolve(process.cwd(), 'data');
  if (fs.existsSync(dataDir)) {
    app.use('/data', express.static(dataDir));
  }

  // Serve React SPA static files if frontend dist exists
  const distDir = path.resolve(process.cwd(), 'dist');
  const indexHtml = path.resolve(distDir, 'index.html');

  if (fs.existsSync(distDir)) {
    // Serve static assets directly
    app.use(express.static(distDir));

    // Fallback all non-API GET requests to index.html
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/assets')) {
        if (fs.existsSync(indexHtml)) {
          return res.sendFile(indexHtml);
        }
      }
      next();
    });
  }

  await app.listen(port, '0.0.0.0');
  logger.log(`Media Library Server running at: http://0.0.0.0:${port}`);
  logger.log(`Swagger OpenAPI Docs available at: http://localhost:${port}/api/docs`);
  logBuffer?.info('Bootstrap', `Media Library Server started on port ${port}`);
}

bootstrap().catch(err => {
  console.error('Fatal error during application startup:', err);
  process.exit(1);
});
