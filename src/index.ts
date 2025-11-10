import { Plugin } from 'kettu';
import * as kettu from 'kettu';
import { React } from 'kettu/webpack';
import { Modals, Forms, Text, Button, Toasts } from 'kettu/common';
import FakeMessageModal from './components/FakeMessageModal';

// Add basic type definitions for Discord modules
interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  bot?: boolean;
}

interface DiscordChannel {
  id: string;
  recipients?: string[] | DiscordUser[];
  type?: number;
}

interface ChannelsModule {
  getPrivateChannels: () => Record<string, DiscordChannel>;
  openPrivateChannel: (userId: string) => Promise<DiscordChannel>;
}

interface MessageModule {
  receiveMessage: (channelId: string, message: any) => void;
}

interface UserModule {
  getUser: (userId: string) => DiscordUser | undefined;
}

interface CachedFakeMessage {
  id: string;
  targetUserId: string;
  fromUserId: string;
  content: string;
  embed?: {
    title?: string;
    description?: string;
    imageUrl?: string;
  };
  timestamp: number;
  channelId: string;
}

export default class FakeMessagesPlugin extends Plugin {
  private cache: CachedFakeMessage[] = [];
  private readonly cacheKey = 'fake-messages-cache';
  private cacheUpdateCallbacks: Array<() => void> = [];

  public async start(): Promise<void> {
    this.loadCache();
    this.injectMessageSending();
    this.patchMessageRenderer();
  }

  public stop(): void {
    this.saveCache();
  }

  private loadCache(): void {
    try {
      const cached = localStorage.getItem(this.cacheKey);
      if (cached) {
        this.cache = JSON.parse(cached);
      }
    } catch (error) {
      console.error('Failed to load fake messages cache:', error);
    }
    // Notify listeners about initial load
    this.notifyCacheUpdate();
  }

  private saveCache(): void {
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify(this.cache));
      this.notifyCacheUpdate();
    } catch (error) {
      console.error('Failed to save fake messages cache:', error);
    }
  }

  // Add callback for cache updates with unsubscribe
  public onCacheUpdate(callback: () => void): () => void {
    this.cacheUpdateCallbacks.push(callback);
    // return unsubscribe
    return () => {
      const idx = this.cacheUpdateCallbacks.indexOf(callback);
      if (idx !== -1) this.cacheUpdateCallbacks.splice(idx, 1);
    };
  }

  private notifyCacheUpdate(): void {
    this.cacheUpdateCallbacks.forEach(callback => callback());
  }

  public async sendFakeMessage(
    targetUserId: string,
    fromUserId: string,
    content: string,
    embed?: { title?: string; description?: string; imageUrl?: string }
  ): Promise<boolean> {
    try {
      // Validate user IDs
      if (!this.isValidSnowflake(targetUserId) || !this.isValidSnowflake(fromUserId)) {
        Toasts.show({
          message: 'Invalid user ID format',
          type: Toasts.Type.FAILURE,
          timeout: 3000
        });
        return false;
      }

      // Get Discord modules with type safety
      const channelsModule = await kettu.webpack.waitForModule(
        kettu.webpack.filters.byProps('getPrivateChannels', 'openPrivateChannel')
      ) as ChannelsModule;

      if (!channelsModule?.getPrivateChannels || !channelsModule?.openPrivateChannel) {
        throw new Error('Required channel functions not found');
      }

      const messageModule = await kettu.webpack.waitForModule(
        kettu.webpack.filters.byProps('receiveMessage')
      ) as MessageModule;

      if (!messageModule?.receiveMessage) {
        throw new Error('receiveMessage function not found');
      }

      const userModule = await kettu.webpack.waitForModule(
        kettu.webpack.filters.byProps('getUser')
      ) as UserModule;

      // Find or create DM channel with proper recipient checking
      const privateChannels = channelsModule.getPrivateChannels();
      let dmChannel: DiscordChannel | undefined;

      for (const channel of Object.values(privateChannels)) {
        if (channel.recipients) {
          // Handle both string arrays and user object arrays
          const recipientIds = Array.isArray(channel.recipients) 
            ? channel.recipients.map((r: any) => typeof r === 'string' ? r : r.id)
            : [];
          
          if (recipientIds.includes(targetUserId)) {
            dmChannel = channel;
            break;
          }
        }
      }

      if (!dmChannel) {
        // Use Discord's proper channel creation API
        try {
          dmChannel = await channelsModule.openPrivateChannel(targetUserId);
        } catch (error) {
          console.error('Failed to create DM channel:', error);
          Toasts.show({
            message: 'Failed to create DM channel with target user',
            type: Toasts.Type.FAILURE,
            timeout: 3000
          });
          return false;
        }
      }

      // Get user info
      const fromUser = userModule.getUser?.(fromUserId) || {
        id: fromUserId,
        username: 'Unknown User',
        discriminator: '0000',
        avatar: null
      };

      // Generate message ID
      const messageId = `fake-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

      // Create fake message object with proper Discord message shape
      const fakeMessage = {
        id: messageId,
        channel_id: dmChannel.id,
        content: content,
        author: fromUser,
        timestamp: new Date().toISOString(),
        embeds: [] as any[],
        attachments: [],
        flags: 0,
        mention_everyone: false,
        mentions: [],
        mention_roles: [],
        pinned: false,
        type: 0,
        tts: false,
        edited_timestamp: null
      };

      // Add embed if provided
      if (embed && (embed.title || embed.description || embed.imageUrl)) {
        const messageEmbed = {
          type: 'rich',
          title: embed.title,
          description: embed.description,
          color: 0x00ff00,
          timestamp: new Date().toISOString(),
          footer: {
            text: `Sent by ${fromUser.username}#${fromUser.discriminator}`,
            icon_url: fromUser.avatar ? 
              `https://cdn.discordapp.com/avatars/${fromUser.id}/${fromUser.avatar}.png` : 
              undefined
          }
        } as any;

        if (embed.imageUrl) {
          messageEmbed.image = { url: embed.imageUrl };
        }

        fakeMessage.embeds.push(messageEmbed);
      }

      // Cache the message
      this.cache.push({
        id: fakeMessage.id,
        targetUserId,
        fromUserId,
        content,
        embed,
        timestamp: Date.now(),
        channelId: dmChannel.id
      });
      this.saveCache();

      // Inject the message into Discord
      messageModule.receiveMessage(dmChannel.id, fakeMessage);

      Toasts.show({
        message: `Fake message sent to user ${targetUserId}`,
        type: Toasts.Type.SUCCESS,
        timeout: 3000
      });

      return true;
    } catch (error) {
      console.error('Error sending fake message:', error);
      Toasts.show({
        message: 'Failed to send fake message',
        type: Toasts.Type.FAILURE,
        timeout: 3000
      });
      return false;
    }
  }

  // Validate Discord snowflake IDs
  private isValidSnowflake(id: string): boolean {
    return /^\d{17,19}$/.test(id);
  }

  private injectMessageSending(): void {
    kettu.webpack.waitForModule(
      kettu.webpack.filters.byProps('sendMessage')
    ).then((module: any) => {
      if (module?.sendMessage) {
        kettu.injector.inject({
          module,
          function: 'sendMessage',
          before: (args: any[]) => {
            const [channelId] = args;
            const fakeMessage = this.cache.find(msg => msg.channelId === channelId);
            
            if (fakeMessage) {
              console.log('Real message sent in fake message channel', fakeMessage);
            }
            
            return args;
          }
        });
      }
    });
  }

  private patchMessageRenderer(): void {
    kettu.webpack.waitForModule(
      kettu.webpack.filters.byProps('Message', 'Reply')
    ).then((MessageComponent: any) => {
      if (MessageComponent?.Message) {
        kettu.injector.inject({
          module: MessageComponent,
          function: 'Message',
          after: (result: any, props: any) => {
            if (!props.message) return result;
            
            const isFakeMessage = this.cache.some(msg => msg.id === props.message.id);
            if (isFakeMessage) {
              // Visual indicators for fake messages could be added here
            }
            
            return result;
          }
        });
      }
    });
  }

  public getCachedMessages(): CachedFakeMessage[] {
    return [...this.cache];
  }

  public clearCache(): void {
    this.cache = [];
    this.saveCache();
    Toasts.show({
      message: 'Fake messages cache cleared',
      type: Toasts.Type.SUCCESS,
      timeout: 3000
    });
  }

  public openSendModal(): void {
    Modals.openModal((props: any) => 
      React.createElement(FakeMessageModal, {
        ...props,
        plugin: this
      })
    );
  }

  public getSettingsPanel(): React.ReactElement {
    return React.createElement(SettingsPanel, { plugin: this });
  }
}

// Reactive Settings Panel Component
const SettingsPanel: React.FC<{ plugin: FakeMessagesPlugin }> = ({ plugin }) => {
  const [cachedMessages, setCachedMessages] = React.useState(plugin.getCachedMessages());

  React.useEffect(() => {
    // Subscribe to cache updates with proper cleanup
    const unsubscribe = plugin.onCacheUpdate(() => {
      setCachedMessages(plugin.getCachedMessages());
    });

    // Cleanup on unmount
    return unsubscribe;
  }, [plugin]);

  const clearCache = () => {
    plugin.clearCache();
  };

  return React.createElement('div', { className: 'fake-messages-settings' },
    React.createElement(Forms.FormTitle, { tag: 'h2' }, 'Fake Messages'),
    React.createElement(Forms.FormText, { type: 'description' },
      'Send fake messages to users with custom embeds and caching'
    ),

    // Ethical warning
    React.createElement(Forms.FormText, { 
      type: 'description',
      className: 'fake-messages-warning'
    }, '⚠️ Use responsibly. Do not impersonate others maliciously.'),

    React.createElement(Button, {
      onClick: () => plugin.openSendModal(),
      color: Button.Colors.GREEN,
      size: Button.Sizes.MEDIUM
    }, 'Send Fake Message'),

    React.createElement(Forms.FormDivider, {}),

    React.createElement(Forms.FormTitle, { tag: 'h3' }, 'Cached Messages'),
    React.createElement(Forms.FormText, { type: 'description' },
      `Total cached messages: ${cachedMessages.length}`
    ),

    cachedMessages.length > 0 && React.createElement(Button, {
      onClick: clearCache,
      color: Button.Colors.RED,
      size: Button.Sizes.SMALL,
      look: Button.Looks.OUTLINED
    }, 'Clear All Cached Messages'),

    cachedMessages.slice(-5).map((msg, index) =>
      React.createElement('div', {
        key: index,
        className: 'fake-messages-cache-item'
      },
        React.createElement(Text, { variant: 'text-sm/normal' },
          `To: ${msg.targetUserId} | From: ${msg.fromUserId}`
        ),
        React.createElement(Text, { variant: 'text-xs/normal', className: 'fake-messages-cache-content' },
          msg.content || 'No content'
        ),
        React.createElement(Text, { variant: 'text-xs/normal', className: 'fake-messages-cache-time' },
          new Date(msg.timestamp).toLocaleString()
        )
      )
    )
  );
};