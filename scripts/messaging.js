// Messaging System
function sendMessageToAdmin(subject, message, userId) {
  if (!userId) {
    userId = localStorage.getItem('currentUserId');
  }

  if (!userId) {
    showAlert('Please complete verification first.', 'warning');
    return false;
  }

  const messageData = {
    userId,
    toUserId: null, // null = admin
    subject,
    message,
    type: 'user_to_admin'
  };

  Database.createMessage(messageData);

  // Create alert for admin
  Database.createAlert({
    type: 'new_message',
    title: 'New Message from User',
    message: `You have a new message: ${subject}`,
    userId,
    priority: 'medium'
  });

  return true;
}

// Initialize message form on passport page
document.addEventListener('DOMContentLoaded', function() {
  const messageForm = document.getElementById('messageForm');
  if (messageForm) {
    messageForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const subject = document.getElementById('messageSubject').value;
      const message = document.getElementById('messageText').value;
      const userId = localStorage.getItem('currentUserId');

      if (sendMessageToAdmin(subject, message, userId)) {
        showAlert('Message sent successfully.', 'success');
        messageForm.reset();
      }
    });
  }
});

