import { AuditLog } from '../models/index.js';

export const audit = (user, action, module, entityId, before, after, ip) =>
  AuditLog.create({
    userId: String(user?.id || 'system'), userName: user?.name || 'System',
    action, module, entityId: entityId && String(entityId), before, after, ip,
  }).catch(() => {});
