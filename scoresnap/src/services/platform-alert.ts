import { Alert, Platform } from 'react-native';

type AlertButtons = Parameters<typeof Alert.alert>[2];
type AlertOptions = Parameters<typeof Alert.alert>[3];

let dialogSequence = 0;

/** Keep native alerts intact and render their actions in a web dialog. */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButtons,
  options?: AlertOptions,
): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    Alert.alert(title, message, buttons, options);
    return;
  }

  const actions: NonNullable<AlertButtons> = buttons?.length ? buttons : [{ text: 'OK' }];
  const dialog = document.createElement('dialog');
  const titleId = `snapscore-alert-title-${++dialogSequence}`;
  const messageId = `snapscore-alert-message-${dialogSequence}`;
  dialog.setAttribute('aria-labelledby', titleId);
  if (message) dialog.setAttribute('aria-describedby', messageId);
  Object.assign(dialog.style, {
    width: 'min(calc(100vw - 32px), 420px)',
    maxWidth: 'calc(100vw - 32px)',
    border: '1px solid #38516b',
    borderRadius: '14px',
    padding: '22px',
    color: '#f5f8fc',
    background: '#10243a',
    boxShadow: '0 16px 48px rgba(0,0,0,.42)',
    font: '16px system-ui, sans-serif',
  });

  const heading = document.createElement('h2');
  heading.id = titleId;
  heading.textContent = title;
  Object.assign(heading.style, { margin: '0 0 10px', fontSize: '20px' });
  dialog.appendChild(heading);

  if (message) {
    const body = document.createElement('p');
    body.id = messageId;
    body.textContent = message;
    Object.assign(body.style, { margin: '0 0 22px', lineHeight: '1.5', whiteSpace: 'pre-wrap' });
    dialog.appendChild(body);
  }

  const footer = document.createElement('div');
  Object.assign(footer.style, { display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' });
  const dismiss = (button?: (typeof actions)[number]) => {
    if (dialog.open) dialog.close();
    dialog.remove();
    button?.onPress?.();
  };

  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.text ?? 'OK';
    Object.assign(button.style, {
      minHeight: '44px',
      padding: '0 16px',
      border: action.style === 'cancel' ? '1px solid #7890a8' : '1px solid #64a8ef',
      borderRadius: '9px',
      color: '#f5f8fc',
      background: action.style === 'destructive' ? '#852f3c' : '#183c5e',
      font: 'inherit',
      cursor: 'pointer',
    });
    button.addEventListener('click', () => dismiss(action));
    footer.appendChild(button);
  }
  dialog.appendChild(footer);

  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (options?.cancelable === false) return;
    dismiss(actions.find(action => action.style === 'cancel'));
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog && options?.cancelable !== false) {
      dismiss(actions.find(action => action.style === 'cancel'));
    }
  });

  document.body.appendChild(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}
