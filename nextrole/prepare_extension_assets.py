"""Render NextRole's simple letter/arrow brand icon; run with the bundled image runtime."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).parent
image=Image.new('RGBA',(600,600),(0,0,0,0));draw=ImageDraw.Draw(image)
draw.rounded_rectangle((0,0,599,599),radius=120,fill='#315d43')
font=ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf',390)
draw.text((90,10),'n',font=font,fill='#ffffff')
draw.line((330,260,475,115),fill='#d8e8bf',width=29)
draw.line((380,115,475,115,475,210),fill='#d8e8bf',width=29,joint='curve')
folder=root/'browser-extension/icons';folder.mkdir(exist_ok=True)
for size in [16,32,48,128]:image.resize((size,size),Image.Resampling.LANCZOS).save(folder/f'icon{size}.png')
folder=root/'extension-publishing';folder.mkdir(exist_ok=True)
image.resize((300,300),Image.Resampling.LANCZOS).save(folder/'store-logo.png')
print('Created extension icons and 300px store logo.')
