graph LR
A[Patient Browser] -->|Encrypt| B[Encrypted Payload]
B --> C[API Gateway]
C --> D[Database]
D -->|Never Decrypt| E[Storage Provider]