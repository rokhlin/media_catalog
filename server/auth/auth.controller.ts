import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UnauthorizedException,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { LoginDto, CreateUserDto, UpdateUserDto, ChangePasswordDto } from './dto/auth.dto.js';
import { Public, Roles, RequirePermissions, CurrentUser } from './auth.decorators.js';
import { JwtAuthGuard } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';

@ApiTags('auth')
@Controller('api/auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Log in with username and password' })
  @ApiResponse({ status: 200, description: 'Authentication token and user details' })
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.validateUser(dto.username, dto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }
    return this.authService.login(user);
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Log out current session' })
  async logout() {
    return { success: true, message: 'Logged out successfully' };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get profile of current authenticated user' })
  async getProfile(@CurrentUser() user: any) {
    if (!user) {
      return {
        authenticated: false,
        user: null,
      };
    }
    const fullUser = this.authService.getUserById(user.sub);
    return {
      authenticated: true,
      user: fullUser || user,
    };
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change password of current authenticated user' })
  async changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    if (!user?.sub) {
      throw new UnauthorizedException('Authentication required');
    }
    const success = this.authService.changePassword(user.sub, dto);
    return { success, message: 'Password updated successfully' };
  }

  // --- User Administration (Admin or manage_users) ---
  @Get('users')
  @Roles('admin')
  @RequirePermissions('manage_users')
  @ApiOperation({ summary: 'List all user accounts (Admin / manage_users)' })
  async listUsers() {
    return this.authService.listUsers();
  }

  @Post('users')
  @Roles('admin')
  @RequirePermissions('manage_users')
  @ApiOperation({ summary: 'Create a new user account' })
  async createUser(@Body() dto: CreateUserDto) {
    return this.authService.createUser(dto);
  }

  @Patch('users/:id')
  @Roles('admin')
  @RequirePermissions('manage_users')
  @ApiOperation({ summary: 'Update an existing user account' })
  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.authService.updateUser(id, dto);
  }

  @Delete('users/:id')
  @Roles('admin')
  @RequirePermissions('manage_users')
  @ApiOperation({ summary: 'Delete a user account' })
  async deleteUser(@Param('id') id: string, @CurrentUser() currentUser: any) {
    const success = this.authService.deleteUser(id, currentUser?.sub);
    return { success, message: 'User deleted successfully' };
  }
}
