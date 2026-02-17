import { mongoose } from '../../infrastructure/mongo';

export type EventStatus = 'ROUTING_PENDING' | 'ROUTED' | 'FAILED';

export interface IEvent {
  eventId: string;
  type: string;
  payload: Record<string, unknown>;
  status: EventStatus;
  correlationId?: string;
  attempts: number;
  error?: string | null;
  processedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const eventSchema = new mongoose.Schema<IEvent>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ['ROUTING_PENDING', 'ROUTED', 'FAILED'],
      default: 'ROUTING_PENDING',
    },
    correlationId: {
      type: String,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    error: {
      type: String,
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes
eventSchema.index({ status: 1, createdAt: -1 });
eventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 * 30 }); // TTL: 30 days

export const Event = mongoose.model<IEvent>('Event', eventSchema);

