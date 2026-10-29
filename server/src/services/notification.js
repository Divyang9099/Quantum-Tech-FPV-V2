import { Notification, NotificationLog, User } from '../models/index.js';
import { emit } from '../realtime/io.js';

/** notify(event, payload): in-app bell for Office/Admin + email log for the client (email transport is pluggable). */
export async function notify(event, payload) {
  if (event === 'booking.created') {
    const { booking, pilot, slot } = payload;
    const title = `New booking ${booking.bookingId} (${booking.source}) · ${pilot.code} · ${booking.date} ${slot.name}`;
    for (const role of ['office', 'admin']) {
      await Notification.create({ role, title, link: '/bookings' });
    }
    emit(['role:admin', 'role:office'], 'notification.new', { title });
    if (booking.contact?.email) {
      await NotificationLog.create({
        channel: 'email', to: booking.contact.email, template: 'booking_confirmation', status: 'queued',
        payload: { bookingId: booking.bookingId, token: booking.trackingToken },
      });
    }
  }
  if (event === 'enquiry.created') {
    const { enquiry } = payload;
    for (const role of ['office', 'admin']) {
      await Notification.create({ role, title: `New enquiry ${enquiry.refNo} from ${enquiry.name}`, link: '/enquiries' });
    }
    emit(['role:admin', 'role:office'], 'enquiry.created', { refNo: enquiry.refNo });
  }
}

export const unreadFor = (user) =>
  Notification.find({ $or: [{ role: user.role }, { userId: user.id }] }).sort({ createdAt: -1 }).limit(20);
void User;
