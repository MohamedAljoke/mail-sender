# Docker Commands

## Build the Docker image
```bash
docker build -t mail-sender-api .
```

## Run the container
```bash
docker run --rm -p 3000:3000 --name mail-sender-api-test mail-sender-api
```

## Test the container (in another terminal)
```bash
curl http://localhost:3000/health
```

## Stop the container
```bash
docker stop mail-sender-api-test
```

## View container logs
```bash
docker logs mail-sender-api-test
```

## Run container in background
```bash
docker run -d -p 3000:3000 --name mail-sender-api mail-sender-api
```