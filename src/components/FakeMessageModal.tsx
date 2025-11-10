import { React } from 'kettu/webpack';
import { Modals, Forms, TextInput, Button, Text } from 'kettu/common';

interface FakeMessageModalProps {
  plugin: any;
  onClose: () => void;
}

interface FakeMessageModalState {
  targetUserId: string;
  fromUserId: string;
  messageContent: string;
  embedTitle: string;
  embedDescription: string;
  embedImageUrl: string;
  showEmbed: boolean;
  isSending: boolean;
  errors: {
    targetUserId?: string;
    fromUserId?: string;
    messageContent?: string;
  };
}

export default class FakeMessageModal extends React.Component<FakeMessageModalProps, FakeMessageModalState> {
  public constructor(props: FakeMessageModalProps) {
    super(props);
    
    this.state = {
      targetUserId: '',
      fromUserId: '',
      messageContent: '',
      embedTitle: '',
      embedDescription: '',
      embedImageUrl: '',
      showEmbed: false,
      isSending: false,
      errors: {}
    };
  }

  public render(): React.ReactElement {
    const { 
      targetUserId, 
      fromUserId, 
      messageContent, 
      embedTitle, 
      embedDescription, 
      embedImageUrl, 
      showEmbed, 
      isSending,
      errors 
    } = this.state;

    const isValid = this.validateForm();

    return React.createElement(Modals.ModalRoot, {},
      React.createElement(Modals.ModalHeader, {},
        React.createElement(Text, { variant: 'heading-lg/bold' }, 'Send Fake Message'),
        React.createElement(Modals.ModalCloseButton, { onClick: this.props.onClose })
      ),

      React.createElement(Modals.ModalContent, {},
        // Ethical warning
        React.createElement(Forms.FormText, { 
          type: 'description',
          className: 'fake-messages-warning'
        }, '⚠️ Use this feature responsibly. Do not impersonate others.'),

        // Target User ID
        React.createElement(Forms.FormItem, {
          title: "Target User ID",
          required: true,
          error: errors.targetUserId
        },
          React.createElement(TextInput, {
            value: targetUserId,
            onChange: (value: string) => this.setState({ targetUserId: value }, this.validateField.bind(this, 'targetUserId', value)),
            placeholder: "123456789012345678",
            disabled: isSending
          })
        ),

        // From User ID
        React.createElement(Forms.FormItem, {
          title: "From User ID",
          required: true,
          error: errors.fromUserId
        },
          React.createElement(TextInput, {
            value: fromUserId,
            onChange: (value: string) => this.setState({ fromUserId: value }, this.validateField.bind(this, 'fromUserId', value)),
            placeholder: "987654321098765432",
            disabled: isSending
          })
        ),

        // Message Content
        React.createElement(Forms.FormItem, {
          title: "Message Content",
          required: true,
          error: errors.messageContent
        },
          React.createElement(TextInput, {
            value: messageContent,
            onChange: (value: string) => this.setState({ messageContent: value }, this.validateField.bind(this, 'messageContent', value)),
            placeholder: "Hello! This is a fake message...",
            disabled: isSending
          })
        ),

        // Embed Toggle
        React.createElement(Forms.FormItem, {},
          React.createElement(Button, {
            onClick: () => this.setState({ showEmbed: !this.state.showEmbed }),
            look: Button.Looks.LINK,
            color: Button.Colors.PRIMARY
          }, showEmbed ? '▼ Hide Embed Fields' : '▶ Show Embed Fields')
        ),

        // Embed Fields
        showEmbed && React.createElement('div', { className: 'fake-messages-embed-fields' },
          React.createElement(Forms.FormItem, {
            title: "Embed Title"
          },
            React.createElement(TextInput, {
              value: embedTitle,
              onChange: (value: string) => this.setState({ embedTitle: value }),
              placeholder: "Embed Title",
              disabled: isSending
            })
          ),

          React.createElement(Forms.FormItem, {
            title: "Embed Description"
          },
            React.createElement(TextInput, {
              value: embedDescription,
              onChange: (value: string) => this.setState({ embedDescription: value }),
              placeholder: "Embed description text...",
              disabled: isSending
            })
          ),

          React.createElement(Forms.FormItem, {
            title: "Embed Image URL"
          },
            React.createElement(TextInput, {
              value: embedImageUrl,
              onChange: (value: string) => this.setState({ embedImageUrl: value }),
              placeholder: "https://example.com/image.png",
              disabled: isSending
            })
          )
        )
      ),

      React.createElement(Modals.ModalFooter, {},
        React.createElement(Button, {
          onClick: this.props.onClose,
          color: Button.Colors.PRIMARY,
          look: Button.Looks.OUTLINED,
          disabled: isSending
        }, 'Cancel'),

        React.createElement(Button, {
          onClick: this.handleSend.bind(this),
          color: Button.Colors.GREEN,
          disabled: isSending || !isValid
        }, isSending ? 'Sending...' : 'Send Fake Message')
      )
    );
  }

  private validateField(field: string, value: string): void {
    const errors = { ...this.state.errors };

    switch (field) {
      case 'targetUserId':
      case 'fromUserId':
        if (!value) {
          errors[field] = 'User ID is required';
        } else if (!/^\d{17,19}$/.test(value)) {
          errors[field] = 'Invalid Discord user ID format';
        } else {
          delete errors[field];
        }
        break;
      
      case 'messageContent':
        if (!value.trim()) {
          errors.messageContent = 'Message content is required';
        } else {
          delete errors.messageContent;
        }
        break;
    }

    this.setState({ errors });
  }

  private validateForm(): boolean {
    const { targetUserId, fromUserId, messageContent } = this.state;
    
    // Final validation pass to ensure no stale errors
    const finalErrors: typeof this.state.errors = {};
    
    if (!targetUserId || !/^\d{17,19}$/.test(targetUserId)) {
      finalErrors.targetUserId = 'Valid target user ID is required';
    }
    
    if (!fromUserId || !/^\d{17,19}$/.test(fromUserId)) {
      finalErrors.fromUserId = 'Valid from user ID is required';
    }
    
    if (!messageContent.trim()) {
      finalErrors.messageContent = 'Message content is required';
    }
    
    // Update state if errors changed
    if (JSON.stringify(finalErrors) !== JSON.stringify(this.state.errors)) {
      this.setState({ errors: finalErrors });
    }
    
    return Object.keys(finalErrors).length === 0 && 
           !!targetUserId && 
           !!fromUserId && 
           !!messageContent.trim();
  }

  private async handleSend(): Promise<void> {
    // Final validation before sending
    if (!this.validateForm()) {
      return;
    }

    this.setState({ isSending: true });

    try {
      const embedData = this.state.showEmbed ? {
        title: this.state.embedTitle,
        description: this.state.embedDescription,
        imageUrl: this.state.embedImageUrl
      } : undefined;

      const success = await this.props.plugin.sendFakeMessage(
        this.state.targetUserId,
        this.state.fromUserId,
        this.state.messageContent,
        embedData
      );

      if (success) {
        this.setState({
          targetUserId: '',
          fromUserId: '',
          messageContent: '',
          embedTitle: '',
          embedDescription: '',
          embedImageUrl: '',
          errors: {}
        });
        
        this.props.onClose();
      }
    } catch (error) {
      console.error('Error sending fake message:', error);
    } finally {
      this.setState({ isSending: false });
    }
  }
}