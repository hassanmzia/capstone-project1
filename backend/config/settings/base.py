"""
Base Django settings for CNEAv5 Neural Interfacing Platform.
"""
import os
from pathlib import Path
from datetime import timedelta

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-dev-key-change-me')

INSTALLED_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third party
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django_filters',
    'channels',
    # Local apps
    'apps.users',
    'apps.experiments',
    'apps.recordings',
    'apps.hardware',
    'apps.presets',
    'apps.analysis',
    'apps.agents_app',
    'apps.notifications',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

# Database
DATABASE_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql://neural_admin:neural_secure_password_2024@localhost:5435/neural_interface'
)
DATABASES = {
    'default': dj_database_url.parse(DATABASE_URL)
}

# Channel layers (Redis)
REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6385')
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [REDIS_URL],
            'capacity': 1500,
            'expiry': 10,
        },
    },
}

# Caches
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': REDIS_URL,
    }
}

# Auth
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
    'DEFAULT_RENDERER_CLASSES': (
        'rest_framework.renderers.JSONRenderer',
    ),
}

# JWT settings
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
}

# CORS
CORS_ALLOWED_ORIGINS = [
    'http://172.168.1.95:3025',
    'http://172.168.1.95:3026',
    'http://localhost:3025',
    'http://localhost:3026',
]
CORS_ALLOW_CREDENTIALS = True

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Media files
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Default auto field
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Custom user model
AUTH_USER_MODEL = 'users.User'

# Neural platform settings
NEURAL_PLATFORM = {
    'MAX_CHANNELS': 4096,
    'ELECTRODE_ROWS': 64,
    'ELECTRODE_COLS': 64,
    'DEFAULT_SAMPLE_RATE': 10000,
    'MAX_WAVEFORM_POINTS': 2048,
    'RING_BUFFER_SIZE_MB': 160,
    'DATA_DIR': os.environ.get('DATA_DIR', '/app/data'),
}

# Hardware safety limits (hard-coded, cannot be overridden)
HARDWARE_SAFETY_LIMITS = {
    'vs_max_voltage': 3.6,
    'vs_min_voltage': 0.0,
    'stim_max_current_ua': 500,
    'stim_max_charge_per_phase_nc': 100,
    'max_stim_frequency_hz': 200000,
    'min_stim_frequency_hz': 0.1,
    'max_waveform_points': 2048,
    'max_waveform_amplitude_v': 3.6,
    'max_pcb_temperature_c': 45.0,
    'max_ic_temperature_c': 42.0,
    'max_voltage_step_v': 0.5,
    'bias_voltage_min': 0.0,
    'bias_voltage_max': 3.3,
}

# LLM Tool Permission Tiers
LLM_TOOL_TIERS = {
    'read_only': [
        'get_stream_status', 'get_device_info', 'get_signal_quality',
        'query_recordings', 'get_recording_metadata', 'get_system_health',
        'compute_statistics', 'compute_fft', 'query_knowledge',
    ],
    'requires_confirmation': [
        'start_recording', 'stop_recording', 'configure_bias',
        'set_clocks', 'set_gain_mode', 'configure_tia',
        'configure_pixels', 'filter_signal', 'reduce_noise', 'export_data',
    ],
    'blocked': [
        'set_stimulation', 'trigger_stimulation', 'upload_waveform',
        'flash_firmware', 'delete_recording', 'manage_users',
    ],
}

# Ollama
OLLAMA_BASE_URL = os.environ.get('OLLAMA_BASE_URL', 'http://172.168.1.95:12434')
OLLAMA_CHAT_MODEL = os.environ.get('OLLAMA_CHAT_MODEL', 'deepseek-r1:7b')
OLLAMA_EMBED_MODEL = os.environ.get('OLLAMA_EMBED_MODEL', 'nomic-embed-text')
