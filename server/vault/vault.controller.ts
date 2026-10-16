import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Headers,
  Query,
  UseGuards,
  Inject,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { VaultService } from './vault.service.js';
import {
  SetupVaultDto,
  UnlockVaultDto,
  VaultItemActionDto,
  UpdateVaultConfigDto,
  RecoverVaultPinRequestDto,
  RecoverVaultPinResetDto,
} from './dto/vault.dto.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Public, RequirePermissions, CurrentUser } from '../auth/auth.decorators.js';

@ApiTags('vault')
@Controller('api/vault')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VaultController {
  constructor(@Inject(VaultService) private readonly vaultService: VaultService) {}

  @Public()
  @Get('status')
  @ApiOperation({ summary: 'Get vault configuration and lock status' })
  @ApiHeader({ name: 'x-vault-token', required: false, description: 'Vault session unlock token' })
  async getStatus(@Headers('x-vault-token') vaultToken?: string) {
    return this.vaultService.getVaultStatus(vaultToken);
  }

  @Public()
  @Post('setup')
  @ApiOperation({ summary: 'Set up master PIN for personal folder' })
  async setup(@Body() dto: SetupVaultDto) {
    return this.vaultService.setupVault(dto);
  }

  @Public()
  @Post('unlock')
  @ApiOperation({ summary: 'Unlock personal folder with PIN' })
  async unlock(
    @Body() dto: UnlockVaultDto,
    @Res({ passthrough: true }) res: any,
    @CurrentUser() user?: any,
  ) {
    const result = this.vaultService.unlockVault(dto, user?.sub);
    try {
      res.cookie('media_cataloger_vault_session', result.sessionToken, {
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
        maxAge: Math.max(0, result.expiresAt - Date.now()),
      });
    } catch {}
    return result;
  }

  @Public()
  @Post('lock')
  @ApiOperation({ summary: 'Lock personal folder' })
  async lock(
    @Headers('x-vault-token') vaultToken: string | undefined,
    @Res({ passthrough: true }) res: any,
  ) {
    this.vaultService.lockVault(vaultToken);
    try {
      res.clearCookie('media_cataloger_vault_session', { path: '/' });
    } catch {}
    return { success: true, message: 'Personal folder locked successfully' };
  }

  @Public()
  @Post('recover-request')
  @ApiOperation({ summary: 'Request PIN recovery code via email' })
  async requestRecovery(@Body() dto: RecoverVaultPinRequestDto, @CurrentUser() user?: any) {
    return this.vaultService.requestPinRecovery(dto.email, user?.sub);
  }

  @Public()
  @Post('recover-reset')
  @ApiOperation({ summary: 'Reset PIN using recovery code sent to email' })
  async resetWithRecovery(@Body() dto: RecoverVaultPinResetDto) {
    return this.vaultService.resetPinWithRecovery(dto.email, dto.recoveryCode, dto.newPin);
  }

  @Post('items')
  @RequirePermissions('vault_access')
  @ApiOperation({ summary: 'Add a media item to personal folder' })
  async addItem(@Body() dto: VaultItemActionDto) {
    const success = this.vaultService.addVaultItem(dto.filePath, dto.notes);
    return { success, filePath: dto.filePath, isVault: true };
  }

  @Delete('items')
  @RequirePermissions('vault_access')
  @ApiOperation({ summary: 'Remove a media item from personal folder' })
  async removeItem(@Query('file') queryFile: string, @Body() dto?: VaultItemActionDto) {
    const target = queryFile || dto?.filePath;
    if (!target) {
      return { success: false, message: 'Missing target file' };
    }
    const success = this.vaultService.removeVaultItem(target);
    return { success, filePath: target, isVault: false };
  }

  @Get('files')
  @RequirePermissions('vault_access')
  @ApiOperation({ summary: 'List all secret vault files (Requires unlocked vault session)' })
  @ApiHeader({ name: 'x-vault-token', required: true, description: 'Vault session unlock token' })
  async listVaultFiles(@Headers('x-vault-token') vaultToken?: string) {
    const files = this.vaultService.listVaultFiles(vaultToken);
    return { files, count: files.length };
  }

  @Get('media-items')
  @RequirePermissions('vault_access')
  @ApiOperation({ summary: 'List all media items in Personal Folder with metadata (Requires unlocked vault session)' })
  @ApiHeader({ name: 'x-vault-token', required: true, description: 'Vault session unlock token' })
  async listVaultMediaItems(@Headers('x-vault-token') vaultToken?: string) {
    return this.vaultService.listVaultMediaItems(vaultToken);
  }

  @Patch('config')
  @RequirePermissions('vault_access')
  @ApiOperation({ summary: 'Update personal folder configuration or PIN' })
  async updateConfig(@Body() dto: UpdateVaultConfigDto) {
    return this.vaultService.updateConfig(dto);
  }

  @Post('change-pin')
  @RequirePermissions('vault_access')
  @ApiOperation({ summary: 'Change personal folder PIN' })
  async changePin(@Body() dto: UpdateVaultConfigDto) {
    return this.vaultService.updateConfig(dto);
  }
}

