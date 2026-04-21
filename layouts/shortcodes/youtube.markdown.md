{{- $id := .Get "id" | default (.Get 0) -}}
{{- with $id -}}[YouTube video](https://www.youtube.com/watch?v={{ . }}){{- end -}}
