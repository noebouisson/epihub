import type { EpihubApi } from '../../shared/types';

declare global {
  interface Window {
    epihub: EpihubApi;
  }
}
