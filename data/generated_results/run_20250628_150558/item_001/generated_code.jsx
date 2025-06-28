```jsx
import React from 'react';
import './App.scss';

const App = () => {
  return (
    <div className="app">
      <header className="header">
        <div className="icon" style={{ backgroundImage: 'url(../assets/back.png)' }}></div>
        <div className="icon" style={{ backgroundImage: 'url(../assets/login.png)' }}></div>
        <div className="icon" style={{ backgroundImage: 'url(../assets/logout.png)' }}></div>
        <div className="icon" style={{ backgroundImage: 'url(../assets/rule.png)' }}></div>
      </header>
      
      <div className="background" style={{ backgroundImage: 'url(../assets/bg.jpg)' }}>
        <div className="title">无限暖暖</div>
        <div className="balloon">
          <div className="balloon-text">
            <div className="main-text">发光发亮</div>
            <div className="sub-text">发福利!</div>
            <div className="infinity-text">INFINITY NIKKI</div>
            <div className="tagline">It's glam time anytime!</div>
          </div>
        </div>
        <div className="characters">
          <div className="character"></div>
          <div className="character"></div>
          <div className="character"></div>
        </div>
        <footer className="footer">
          <button className="action-button">获取火花</button>
          <button className="action-button">点燃花焰筒</button>
        </footer>
      </div>
    </div>
  );
};

export default App;
```

```scss
.app {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: #1a0f2b;
}

.header {
  position: absolute;
  top: 10dx;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  justify-content: space-between;
  width: 320dx;
  padding: 0 10dx;
}

.icon {
  width: 24dx;
  height: 24dx;
  background-size: cover;
}

.background {
  position: relative;
  width: 100%;
  height: 100%;
  background-size: cover;
}

.title {
  position: absolute;
  top: 20dx;
  left: 50%;
  transform: translateX(-50%);
  font-size: 24dx;
  color: #fff;
}

.balloon {
  position: absolute;
  top: 80dx;
  left: 50%;
  transform: translateX(-50%);
  width: 240dx;
  height: 320dx;
  background-size: cover;
}

.balloon-text {
  position: absolute;
  top: 20dx;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  color: #fff;
}

.main-text {
  font-size: 24dx;
  font-weight: bold;
}

.sub-text {
  font-size: 20dx;
  margin-top: 5dx;
}

.infinity-text, .tagline {
  font-size: 14dx;
  margin-top: 3dx;
}

.characters {
  position: absolute;
  bottom: 120dx;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  display: flex;
  justify-content: center;
  gap: 10dx;
}

.character {
  width: 60dx;
  height: 60dx;
  background-size: cover;
}

.footer {
  position: absolute;
  bottom: 20dx;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  justify-content: space-between;
  width: 160dx;
}

.action-button {
  background-color: #fda44b;
  color: #fff;
  font-size: 16dx;
  padding: 5dx 10dx;
  border: none;
  border-radius: 5dx;
  cursor: pointer;
}
```