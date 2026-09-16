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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { VaultService } from './vault.service.js';
import {
  SetupVaultDto,
  UnlockVaultDto,
  VaultItemActionDto,
  UpdateVaultConfigDto,
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
  @ApiOperation({ summary: 'Set up master PIN for secret vault' })
  async setup(@Body() dto: SetupVaultDto) {
    return this.vaultService.setupVault(dto);
  }

  @Public()
  @Post('unlock')
  @ApiOperation({ summary: 'Unlock vault with PIN' })
  async unlock(@Body() dto: UnlockVaultDto, @CurrentUser() user?: any) {
    return this.vaultService.unlockVault(dto, user?.sub);
  }

  @Public()
  @Post('lock')
  @ApiOperation({ summary: 'Lock vault' })
  async lock(@Headers('x-vault-token') vaultToken?: string) {
    this.vaultService.lockVault(vaultToken);
    return { success: true, message: 'Vault locked successfully' };
  }

  @Post('items')
  @RequirePermissions('vault_access')
  @ApiOperation({ summary: 'Add a media item to secret vault' })
  async addItem(@Body() dto: VaultItemActionDto) {
    const success = this.vaultService.addVaultItem(dto.filePath, dto.notes);
    return { success, filePath: dto.filePath, isVault: true };
  }

  @Delete('items')
  @RequirePermissions('vault_access')
  @ApiOperation({ summary: 'Remove a media item from secret vault' })
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

  @Patch('config')
  @RequirePermissions('admin_panel')
  @ApiOperation({ summary: 'Update vault configuration or PIN (Admin)' })
  async updateConfig(@Body() dto: UpdateVaultConfigDto) {
    return this.vaultService.updateConfig(dto);
  }
}
