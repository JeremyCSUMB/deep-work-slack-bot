# Deep Work Tracker Slack Bot

## Table of Contents
1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Local Setup](#local-setup)
4. [Deployment](#deployment)
5. [Usage](#usage)
6. [Troubleshooting](#troubleshooting)
7. [Contributing](#contributing)
8. [License](#license)

## Introduction

The Deep Work Tracker is a Slack bot designed to help users track their deep work sessions. It allows users to start and end sessions using a slash command, and stores session data for future analysis.

## Prerequisites

- Node.js (v14 or later)
- Docker and Docker Compose
- A Slack workspace with permission to add apps
- An AWS account (for EC2 deployment)
- MongoDB Atlas account (for cloud database)

## Local Setup

1. **Clone the repository:**
   ```
   git clone https://github.com/your-username/deep-work-slack-bot.git
   cd deep-work-slack-bot
   ```

2. **Create a `.env` file in the project root:**
   ```
   SLACK_SIGNING_SECRET=your_slack_signing_secret
   SLACK_BOT_TOKEN=your_slack_bot_token
   MONGODB_URI=your_mongodb_atlas_connection_string
   ```

3. **Install dependencies:**
   ```
   npm install
   ```

4. **Build and run the Docker containers:**
   ```
   docker-compose up --build
   ```

5. **Create a Slack App:**
   - Go to https://api.slack.com/apps and create a new app
   - Under "Basic Information", note your Signing Secret
   - Under "OAuth & Permissions", add the `commands` scope and install the app to your workspace
   - Note the Bot User OAuth Token

6. **Update your `.env` file with the Slack credentials**

7. **Set up slash command:**
   - In your Slack App settings, go to "Slash Commands"
   - Create a new command called `/deepwork`
   - Set the Request URL to `http://your-ngrok-url/slack/events`

8. **Set up event subscriptions:**
   - In your Slack App settings, go to "Event Subscriptions"
   - Enable events and set the Request URL to `http://your-ngrok-url/slack/events`

9. **Use ngrok for local testing:**
   ```
   ngrok http 3000
   ```
   Update your Slack App's Request URLs with the ngrok URL

## Deployment

This application is designed to be deployed on an AWS EC2 instance and uses MongoDB Atlas for data storage.

1. **Launch an EC2 instance:**
   - Use Amazon Linux 2 AMI
   - Configure security group to allow inbound traffic on ports 22 (SSH), 80 (HTTP), 443 (HTTPS), and 3000 (your app)

2. **Connect to your EC2 instance:**
   ```
   ssh -i /path/to/your-key-pair.pem ec2-user@your-instance-public-dns
   ```

3. **Update the system and install dependencies:**
   ```
   sudo yum update -y
   sudo yum install -y git
   ```

4. **Install Docker and Docker Compose:**
   ```
   sudo amazon-linux-extras install docker
   sudo service docker start
   sudo usermod -a -G docker ec2-user
   sudo chkconfig docker on
   sudo curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```
   Log out and log back in for the docker group changes to take effect.

5. **Clone your repository:**
   ```
   git clone https://github.com/your-username/deep-work-slack-bot.git
   cd deep-work-slack-bot
   ```

6. **Set up environment variables:**
   ```
   nano .env
   ```
   Add your environment variables, including the MongoDB Atlas connection string.

7. **Build and run your Docker containers:**
   ```
   docker-compose up --build -d
   ```

8. **Set up Nginx as a reverse proxy (optional but recommended):**
   ```
   sudo amazon-linux-extras install nginx1
   sudo systemctl start nginx
   sudo systemctl enable nginx
   ```
   Create a new Nginx configuration:
   ```
   sudo nano /etc/nginx/conf.d/deepwork.conf
   ```
   Add this configuration:
   ```nginx
   server {
       listen 80;
       server_name your_domain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
   Test and restart Nginx:
   ```
   sudo nginx -t
   sudo systemctl restart nginx
   ```

9. **Set up SSL with Let's Encrypt (optional but recommended):**
   ```
   sudo amazon-linux-extras install epel
   sudo yum install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d your_domain.com
   ```

10. **Update Slack App configuration:**
    - Update the Event Subscriptions URL to `https://your_domain.com/slack/events`
    - Update the Slash Commands URL to `https://your_domain.com/slack/events`

## Usage

- In any Slack channel, use the `/deepwork` command to start a deep work session
- Use `/deepwork` again to end the session
- Access `https://your_domain.com/export-sessions` to export all session data

## Troubleshooting

- **MongoDB connection issues:** Check your MongoDB Atlas connection string and ensure it's correctly set in the `.env` file
- **Slack commands not working:** Verify Slack App configuration and environment variables
- **Connection issues:** Check EC2 security group settings and ensure ports are open

To view logs:
```
docker logs deep-work-slack-bot-app-1
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.