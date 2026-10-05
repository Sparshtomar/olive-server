// Public API of the users module. Other modules use the service; only the composition root sees the repository.
export { meRoutes, publicUserRoutes } from './user.routes';
export { UserService } from './user.service';
