import { NotFoundException } from '@nestjs/common';
import { EncryptionService } from '../crypto/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { SnippetService } from './snippet.service';

describe('SnippetService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let encryption: jest.Mocked<EncryptionService>;
  let service: SnippetService;

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn() },
    } as unknown as jest.Mocked<PrismaService>;
    encryption = {
      decrypt: jest.fn().mockReturnValue('ltk_live_test'),
    } as unknown as jest.Mocked<EncryptionService>;
    service = new SnippetService(prisma, encryption);
  });

  it('throws when the project is unknown', async () => {
    (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(
      service.generate('missing', 'http://api'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('generates syntactically valid JavaScript', async () => {
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: 'p1',
      apiKeyEncrypted: 'enc',
      trackerConfig: null,
    });
    const js = await service.generate('p1', 'http://api');
    // Must parse as a function body without throwing.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- syntax validation only (Function constructor parses, never runs the snippet)
    expect(() => new Function(js)).not.toThrow();
  });

  it('preserves the public API surface and embeds config', async () => {
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: 'p1',
      apiKeyEncrypted: 'enc',
      trackerConfig: null,
    });
    const js = await service.generate('p1', 'http://api.example.com');
    expect(js).toContain('window.libertyTracker');
    expect(js).toContain('track:');
    expect(js).toContain('buildWaLink:');
    expect(js).toContain('capabilities:');
    expect(js).toContain('consent:');
    expect(js).toContain('getHealth:');
    expect(js).toContain('ltk_live_test');
    expect(js).toContain('"apiUrl":"http://api.example.com"');
    // embedded pure helpers are present
    expect(js).toContain('function parseClickIds');
    expect(js).toContain('function classifyChannel');
    expect(js).toContain('function computeBackoff');
  });

  it('honors SDK feature flags from trackerConfig (embeds them)', async () => {
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: 'p1',
      apiKeyEncrypted: 'enc',
      trackerConfig: { sdkFlags: { fingerprint: false, batch: false } },
    });
    const js = await service.generate('p1', 'http://api');
    expect(js).toContain('"fingerprint":false');
    expect(js).toContain('"batch":false');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- syntax validation only (Function constructor parses, never runs the snippet)
    expect(() => new Function(js)).not.toThrow();
  });
});
