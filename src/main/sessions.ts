import { session } from 'electron';
import { cleanUserAgent, isPermissionAllowed, SERVICE_PARTITIONS } from './securityPolicy';

/** UA nettoyé et permissions restreintes pour chaque partition de service. */
export function configureServiceSessions(): void {
  for (const partition of SERVICE_PARTITIONS) {
    const ses = session.fromPartition(partition);
    ses.setUserAgent(cleanUserAgent(ses.getUserAgent()));
    ses.setPermissionRequestHandler((_wc, permission, callback) => callback(isPermissionAllowed(partition, permission)));
    ses.setPermissionCheckHandler((_wc, permission) => isPermissionAllowed(partition, permission));
  }
}
