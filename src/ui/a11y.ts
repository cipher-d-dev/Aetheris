import {MessageStatus} from '../types/message';

export function statusLabel(status: MessageStatus): string {
  switch (status) {
    case 'pending':
      return 'Sending';
    case 'sent':
      return 'Sent';
    case 'delivered':
      return 'Delivered';
    case 'failed':
      return 'Not delivered';
  }
}
