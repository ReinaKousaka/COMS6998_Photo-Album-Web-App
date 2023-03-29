'''Documentation:
opensearchpy: https://opensearch-project.github.io/opensearch-py/api-ref/clients/opensearch_client.html#opensearchpy.OpenSearch.index
'''
import boto3
import json
from requests_aws4auth import AWS4Auth
from opensearchpy import OpenSearch, RequestsHttpConnection
from datetime import *
import urllib
from base64 import b64decode, decodebytes

# OpenSearch
REGION = 'us-east-1'
HOST = 'search-photos-u5cripkrzbx3hj72iep5ylr5ai.us-east-1.es.amazonaws.com'
INDEX = 'photos'

s3_client = boto3.client('s3')
rek_client = boto3.client('rekognition')


def get_labels(image):
    response = rek_client.detect_labels(
        Image={
            'Bytes': image
        },
        MaxLabels=10
    )
    labels = list(map(lambda x: x['Name'].lower(), response['Labels']))
    print(f'labels are {labels}')
    return labels


def retrieve_metadata(bucket, key):    
    response = s3_client.head_object(Bucket=bucket, Key=key)
    print(f'head_object res is {response}')
    customlabels = []
    if response["Metadata"]:
        # TODO: check correctness of customlabels
        customlabels = response["Metadata"]["customlabels"]
        print(f'customlabels: {customlabels}')
        customlabels = customlabels.split(',')
        customlabels = list(map(lambda x: x.lower(), customlabels))
    return customlabels


def store_open_search(json_data):
    def get_awsauth(region, service):
        cred = boto3.Session().get_credentials()
        return AWS4Auth(
            cred.access_key,
            cred.secret_key,
            region,
            service,
            session_token=cred.token
        )
    
    opensearch_client = OpenSearch(
        hosts = [{'host': HOST, 'port': 443}],
        http_auth = get_awsauth(REGION, 'es'),
        use_ssl = True,
        verify_certs = True,
        connection_class = RequestsHttpConnection
    )
    try:
        response = opensearch_client.index(
            index='photos',
            body=json.dumps(json_data)
        )
        print(f'response is {response}')
        return response
    except Exception as e:
        print(f'failed to upload to OpenSearch: {e}')
    

def get_decoded_img(bucket, key):
    response = s3_client.get_object(Bucket=bucket, Key=key)
    encoded_image = response['Body'].read().decode('utf-8')
    # important: truncate everything before ;base64,
    idx = encoded_image.find(';base64,')
    assert(idx >= 0)
    encoded_image = encoded_image[idx + 8:]
    # important: add padding characters to the encoded data
    decoded_image = b64decode(f"{encoded_image}{'=' * (4 - len(encoded_image) % 4)}")
    return decoded_image


def lambda_handler(event, context):
    record = event['Records'][0]
    print(f'record is {record}')
    bucket = record['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(record['s3']['object']['key'], encoding='uft-8')
    custom_labels = retrieve_metadata(bucket, key)
    
    decoded_image = get_decoded_img(bucket, key)
    labels = get_labels(decoded_image)

    createdTimestamp = record['eventTime']

    response = store_open_search({
        'objectKey': key,
        'bucket': bucket,
        'createdTimestamp': createdTimestamp,
        'labels': labels + custom_labels
    })

    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': '*',
        },
        'body': json.dumps({'results': response})
    }
