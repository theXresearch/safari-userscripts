#!/bin/sh
# 영상 받기 시험용 HLS·MP4 만들기 (ffmpeg 필요) → tests/fixtures/hls
set -e
D="$(dirname "$0")/fixtures/hls"; rm -rf "$D"; mkdir -p "$D"; cd "$D"
Q="-loglevel error"
ffmpeg $Q -f lavfi -i testsrc=size=640x360:rate=25 -f lavfi -i sine=frequency=440:sample_rate=44100 -t 20 -c:v libx264 -preset veryfast -g 50 -c:a aac -shortest src.mp4
mkdir v360 v240 enc enc2 fm
ffmpeg $Q -i src.mp4 -c copy -hls_time 2 -hls_list_size 0 -hls_segment_filename 'v360/s%03d.ts' v360/index.m3u8
ffmpeg $Q -i src.mp4 -vf scale=426:240 -c:v libx264 -preset veryfast -g 50 -c:a copy -hls_time 2 -hls_list_size 0 -hls_segment_filename 'v240/s%03d.ts' v240/index.m3u8
printf '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\nv360/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=426x240\nv240/index.m3u8\n' > master.m3u8
openssl rand 16 > enc/k.key
printf 'https://cdn.test/hls/enc/k.key\nenc/k.key\n%s\n' "$(openssl rand -hex 16)" > keyinfo
ffmpeg $Q -i src.mp4 -c copy -hls_time 2 -hls_list_size 0 -hls_key_info_file keyinfo -hls_segment_filename 'enc/s%03d.ts' enc/index.m3u8
# enc2: IV를 적지 않은 암호화 (조각 순번이 IV) — 순번은 5부터 시작
cp enc/k.key enc2/k.key; K=$(od -An -tx1 enc2/k.key | tr -d " \n")
awk 'NR==1{print; next} /MEDIA-SEQUENCE/{print "#EXT-X-MEDIA-SEQUENCE:5"; print "#EXT-X-KEY:METHOD=AES-128,URI=\"k.key\""; next} {print}' v360/index.m3u8 > enc2/index.m3u8
i=5; for f in v360/s*.ts; do openssl aes-128-cbc -K "$K" -iv "$(printf '%032x' $i)" -in "$f" -out "enc2/$(basename "$f")"; i=$((i+1)); done
ffmpeg $Q -i src.mp4 -c copy -hls_time 2 -hls_list_size 0 -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 -hls_segment_filename 'fm/s%03d.m4s' fm/index.m3u8
head -c 9000000 /dev/urandom > big.bin; cat src.mp4 big.bin > big.mp4; rm big.bin   # 4MB 넘는 파일 (나눠 받기 시험)
