export class MessengerSocket {
    private ws: WebSocket | null = null;
    private deviceId: string;
    private onMessageCallback: (msg: string) => void;
    private reconnectTimer: any;
    private isManuallyDisconnected = false;

    constructor(deviceId: string, onMessage: (msg: string) => void) {
        this.deviceId = deviceId;
        this.onMessageCallback = onMessage;
    }

    connect() {
        if (this.isManuallyDisconnected) return;
        this.ws = new WebSocket(`ws://${window.location.hostname}:8000/ws/${this.deviceId}`);
        this.ws.onmessage = (event) => {
            this.onMessageCallback(event.data);
        };
        this.ws.onerror = () => {
            this.ws?.close();
        };
        this.ws.onclose = () => {
            if (!this.isManuallyDisconnected) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), 2000);
            }
        };
    }

    sendPayload(recipientUserId: string, payload: string) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ recipient_user_id: recipientUserId, payload }));
        }
    }

    disconnect() {
        this.isManuallyDisconnected = true;
        clearTimeout(this.reconnectTimer);
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
