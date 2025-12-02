// Messaging System
async function sendMessageToAdmin(subject, message, userId) {
  if (!userId) {
    userId = localStorage.getItem('currentUserId');
  }

  if (!userId) {
    showAlert('Please complete verification first.', 'warning');
    return false;
  }

  try {
    const messageData = {
      userId: parseInt(userId),
      toUserId: null, // null = admin
      subject,
      message
    };

    await API.createMessage(messageData);

    // Create alert for admin
    try {
      await API.createAlert({
        userId: parseInt(userId),
        type: 'new_message',
        title: 'New Message from User',
        message: `You have a new message: ${subject}`,
        priority: 'medium'
      });
    } catch (alertError) {
      console.error('Failed to create alert:', alertError);
    }

    return true;
  } catch (error) {
    console.error('Failed to send message:', error);
    showAlert('Failed to send message. Please try again.', 'danger');
    return false;
  }
}

// Initialize message form on passport page
document.addEventListener('DOMContentLoaded', function() {
  const messageForm = document.getElementById('messageForm');
  if (messageForm) {
    messageForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const subject = document.getElementById('messageSubject').value;
      const message = document.getElementById('messageText').value;
      const userId = localStorage.getItem('currentUserId');

      const success = await sendMessageToAdmin(subject, message, userId);
      if (success) {
        showAlert('Message sent successfully.', 'success');
        messageForm.reset();
      }
    });
  }
});

