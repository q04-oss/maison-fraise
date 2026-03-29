import React from 'react';
import Svg, { Path, G } from 'react-native-svg';

interface Props {
  size?: number;
}

const StrawberrySVG: React.FC<Props> = ({ size = 48 }) => {
  const h = size * 1.25;
  return (
    <Svg width={size} height={h} viewBox="0 0 48 60">
      <G>
        {/* Left leaf */}
        <Path
          d="M24 16 C22 11 15 7 17 2 C19 5 22 11 24 16Z"
          fill="#3D6B3D"
        />
        {/* Right leaf */}
        <Path
          d="M24 16 C26 11 33 7 31 2 C29 5 26 11 24 16Z"
          fill="#2D5A2D"
        />
        {/* Centre leaf */}
        <Path
          d="M24 16 C24 10 22 4 24 2 C26 4 24 10 24 16Z"
          fill="#4A8040"
        />

        {/* Strawberry body — red */}
        <Path
          d="M10 26
             C8 36 10 48 18 55
             C21 58 24 59 24 59
             C24 59 27 58 30 55
             C38 48 40 36 38 26
             C34 18 28 15 24 15
             C20 15 14 18 10 26Z"
          fill="#CC3333"
        />

        {/* Chocolate dip — lower ~40% */}
        <Path
          d="M10 42
             C10 52 16 57 24 59
             C32 57 38 52 38 42
             C32 40 28 39 24 39
             C20 39 16 40 10 42Z"
          fill="#2C1810"
        />
      </G>
    </Svg>
  );
};

export default StrawberrySVG;
