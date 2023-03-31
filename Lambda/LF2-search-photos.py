'''Documentation:
lexv2: https://docs.aws.amazon.com/lexv2/latest/APIReference/API_runtime_RecognizeText.html
'''
import json
import boto3
from opensearchpy import OpenSearch, RequestsHttpConnection
import requests
from requests_aws4auth import AWS4Auth
import inflection.inflection as inflection

# OpenSearch
REGION = 'us-east-1'
HOST = 'search-photos-u5cripkrzbx3hj72iep5ylr5ai.us-east-1.es.amazonaws.com'
INDEX = 'photos'


def send_to_lex(text):
    lex_client = boto3.client('lexv2-runtime')
    try:
        response = lex_client.recognize_text(
            botId='G1GLDA433L', # MODIFY HERE
            botAliasId='TSTALIASID', # MODIFY HERE
            localeId='en_US',
            sessionId='testuser',
            text=text
        )
    except Exception as e:
        print(f'failed to send to lex: {e}')
        return []
    
    labels = []
    try:
        slots = response['interpretations'][0]['intent']['slots']
        for key, value in slots.items():
            if value is not None:
                labels.append(inflection.singularize(value['value']['interpretedValue']))
    except Exception as e:
        print(f'failed to get labels: {e}')
    print(f'labels are {labels}')
    return labels


def search_open_search(labels):
    def get_awsauth(region, service):
        cred = boto3.Session().get_credentials()
        return AWS4Auth(
            cred.access_key,
            cred.secret_key,
            region,
            service,
            session_token=cred.token
        )

    query = {
        "size": 3,
        "query": {
            "bool": {
                "should": []
            }
        }
    }
    for label in labels:
        query['query']['bool']['should'].append({
            "match": {
                "labels": label
            }
        })
    
    opensearch_client = OpenSearch(
        hosts = [{'host': HOST, 'port': 443}],
        http_auth = get_awsauth(REGION, 'es'),
        use_ssl = True,
        verify_certs = True,
        connection_class = RequestsHttpConnection
    )
    try:
        response = opensearch_client.search(
            index='photos',
            body=query
        )
        hits = response['hits']['hits']
        print(f'hits are {hits}')
        img_list = set()
        for element in hits:
            objectKey = element['_source']['objectKey']
            bucket = element['_source']['bucket']
            image_url = f'https://{bucket}.s3.amazonaws.com/{objectKey}'
            img_list.add(image_url)
        return list(img_list)
    except Exception as e:
        print(f'failed to search from OpenSearch: {e}')


def lambda_handler(event, context):
    def die(return_body):
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': '*',
            },
            'body': return_body
        }

    print(f'event is {event}')
    q = event['queryStringParameters']['q']
    print(f'q is {q}')
    labels = send_to_lex(q)
    if not labels:
        return die(json.dumps({'results': 'No Result Found'}))
    
    img_list = search_open_search(labels)
    if not img_list:
        return die(json.dumps({'results': 'No Result Found'}))
    return die(json.dumps({'results': img_list}))
