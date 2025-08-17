import { Request, Response } from 'express';
import { NotificationService } from '../services/NotificationService';
import { createServiceLogger } from '@e-commerce/shared';

const logger = createServiceLogger('notification-controller');
const notificationService = new NotificationService();

export class NotificationController {
  // Get notification by ID
  static async getNotification(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const notification = await notificationService.getNotificationById(id);
      
      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }
      
      res.json(notification);
    } catch (error: any) {
      logger.error('Error getting notification:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get notifications by recipient
  static async getNotificationsByRecipient(req: Request, res: Response) {
    try {
      const { recipientId } = req.params;
      const notifications = await notificationService.getNotificationsByRecipient(recipientId);
      res.json(notifications);
    } catch (error: any) {
      logger.error('Error getting notifications by recipient:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get notifications by status
  static async getNotificationsByStatus(req: Request, res: Response) {
    try {
      const { status } = req.params;
      const notifications = await notificationService.getNotificationsByStatus(status);
      res.json(notifications);
    } catch (error: any) {
      logger.error('Error getting notifications by status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Send manual notification
  static async sendNotification(req: Request, res: Response) {
    try {
      const { recipientId, type, template, content } = req.body;
      
      if (!recipientId || !type || !template) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const notification = await notificationService.sendNotification({
        recipientId,
        type,
        template,
        content: content || {}
      });
      
      res.status(201).json(notification);
    } catch (error: any) {
      logger.error('Error sending notification:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Retry failed notification
  static async retryNotification(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await notificationService.retryNotification(id);
      
      if (!result) {
        return res.status(404).json({ error: 'Notification not found' });
      }
      
      res.json({ message: 'Notification retry initiated', notification: result });
    } catch (error: any) {
      logger.error('Error retrying notification:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get notification statistics
  static async getNotificationStats(req: Request, res: Response) {
    try {
      const stats = await notificationService.getNotificationStats();
      res.json(stats);
    } catch (error: any) {
      logger.error('Error getting notification stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
