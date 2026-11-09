pipeline {
    agent { label 'docker-eks' }

    options {
        disableConcurrentBuilds()
    }

    triggers {
        githubPush()
    }

    environment {
        IMAGE_REPO = 'dockervijay1998/trend'
        AWS_REGION = 'ap-south-1'
        EKS_CLUSTER = 'trend-eks'
    }

    stages {
        stage('Build and test') {
            steps {
                sh '''
                    set -eu
                    image="$IMAGE_REPO:$GIT_COMMIT"
                    docker build -t "$image" .
                    container=$(docker run -d -p 127.0.0.1::3000 "$image")
                    trap 'docker rm -f "$container" >/dev/null' EXIT
                    address=$(docker port "$container" 3000/tcp)
                    curl -fsS --retry 10 --retry-connrefused "http://$address/healthz"
                    curl -fsS "http://$address/" >/dev/null
                '''
            }
        }

        stage('Push image') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_TOKEN'
                )]) {
                    sh '''
                        set +x
                        set -eu
                        DOCKER_CONFIG=$(mktemp -d)
                        export DOCKER_CONFIG
                        trap 'rm -rf "$DOCKER_CONFIG"' EXIT
                        printf '%s' "$DOCKER_TOKEN" | docker login \
                          --username "$DOCKER_USER" --password-stdin
                        docker push "$IMAGE_REPO:$GIT_COMMIT"
                    '''
                }
            }
        }

        stage('Deploy to EKS') {
            steps {
                sh '''
                    set -eu
                    KUBECONFIG=$(mktemp)
                    export KUBECONFIG
                    trap 'rm -f "$KUBECONFIG"' EXIT

                    aws eks update-kubeconfig --region "$AWS_REGION" --name "$EKS_CLUSTER"
                    sed "s|__TREND_IMAGE__|$IMAGE_REPO:$GIT_COMMIT|g" k8s/deployment.yaml |
                      kubectl -n trend apply -f -
                    kubectl -n trend apply -f k8s/service.yaml
                    kubectl -n trend rollout status deployment/trend --timeout=10m
                    kubectl -n trend wait \
                      --for=jsonpath='{.status.loadBalancer.ingress[0].hostname}' \
                      service/trend --timeout=10m

                    host=$(kubectl -n trend get service trend \
                      -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
                    curl -fsS --retry 30 --retry-all-errors --retry-delay 10 \
                      --max-time 5 "http://$host:3000/healthz"

                    arn=$(aws elbv2 describe-load-balancers --region "$AWS_REGION" \
                      --query "LoadBalancers[?DNSName=='$host'].LoadBalancerArn | [0]" \
                      --output text)
                    test -n "$arn" && test "$arn" != None
                    echo "Application URL: http://$host:3000/"
                    echo "Load balancer ARN: $arn"
                '''
            }
        }
    }
}