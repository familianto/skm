import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';

type DriveApi = drive_v3.Drive;

class GoogleDriveService {
  private drive: DriveApi | null = null;

  /**
   * Get authenticated Google Drive API client (lazy init, singleton)
   */
  private async getClient(): Promise<DriveApi> {
    if (this.drive) return this.drive;

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    this.drive = google.drive({ version: 'v3', auth });
    return this.drive;
  }

  /**
   * Upload a file to Google Drive
   * Returns the file ID
   */
  async uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    folderId?: string
  ): Promise<string> {
    const client = await this.getClient();

    const fileMetadata: drive_v3.Schema$File = {
      name: fileName,
      parents: folderId ? [folderId] : undefined,
    };

    const media = {
      mimeType,
      body: Readable.from(fileBuffer),
    };

    const response = await client.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id',
    });

    const fileId = response.data.id;
    if (!fileId) throw new Error('Failed to upload file: no file ID returned');

    // Make file viewable by anyone with the link
    await client.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    return fileId;
  }

  /**
   * Get the public URL for a file
   */
  getFileUrl(fileId: string): string {
    return `https://drive.google.com/file/d/${fileId}/view`;
  }

  /**
   * Get direct thumbnail/preview URL for an image
   */
  getThumbnailUrl(fileId: string): string {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
  }

  /**
   * Delete a file from Google Drive
   */
  async deleteFile(fileId: string): Promise<void> {
    const client = await this.getClient();
    await client.files.delete({ fileId });
  }
}

// Singleton instance
export const driveService = new GoogleDriveService();
