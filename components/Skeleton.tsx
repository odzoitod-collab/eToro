import React from 'react';
import clsx from 'clsx';

interface SkeletonProps {
  className?: string;
  rounded?: boolean;
}

const Skeleton: React.FC<SkeletonProps> = ({ className = '', rounded = true }) => {
  return (
    <div
      className={clsx(
        'bg-neutral-800/80 animate-pulse',
        rounded ? 'rounded-lg' : '',
        className,
      )}
    />
  );
};

export default Skeleton;

